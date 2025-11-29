const { query } = require('../config/db');

const authorizeOwnership = (resourceTable, ownerColumn = 'user_id', idParam = 'id') => async (req, res, next) => {
    if (!req.user || !req.user.userId) {
        const authError = new Error('Authentication required');
        authError.statusCode = 401;
        return next(authError);
    }
    const resourceId = req.params[idParam];
    if (!resourceId) {
        const missingIdError = new Error(`Resource id not provided for ${resourceTable}`);
        missingIdError.statusCode = 401;
        return next(missingIdError);
    }
    try {
        const resourceResult = await query(`SELECT ${ownerColumn} FROM ${resourceTable} WHERE id = $1 `, [resourceId]);
        if (resourceResult.rows.length === 0) {
            const notFoundError = new Error('not found');
            notFoundError.statusCode = 404;
            return next(notFoundError);
        }
        const ownerColumnId = resourceResult.rows[0][ownerColumn];

        const isOwner = ownerColumn === req.user.userId;
        const isAdmin = req.user.roles && req.user.roles.includes('admin');
        if (!isOwner || !isAdmin) {
            const forbidenError = new Error('You are not authorized to modify this', resourceTable);
            forbidenError.statusCode = 403;
            return next(forbidenError);
        }
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = authorizeOwnership;