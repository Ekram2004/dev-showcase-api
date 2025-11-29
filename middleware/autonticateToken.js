const jwt = require('jsonwebtoken');
const { query } = require('../config/db');


const authenticateToken = async (req, res, next) => {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        const authError = new Error('Authentication token required');
        authError.statusCode = 401;
        return next(authError);
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userWithRoles = await query('SELECT u.id , u.username, u.email, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1', [decoded.userId]);
        if (userWithRoles.rows.length === 0) {
            const notFoundError = new Error('User not found or invalid role ');
            notFoundError.statusCode = 401;
            return next(notFoundError);
        }
        req.user = {
            userId: userWithRoles.rows[0].id,
            username: userWithRoles.rows[0].username,
            roles: [userWithRoles.rows[0].role_name]
        };
        next();
    } catch (err) {
        const authError = new Error('Invalid or expired token.');
        authError.statusCode = 403;
        next(authError);
    }
}

module.exports = authenticateToken;