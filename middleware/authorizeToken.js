const authorizeRole = (requiredRole) => (req, res, next) => {
    if (!req.user || !req.user.roles) {
    const authError = new Error('User roles not available. Authentication might be missing.');
    authError.statusCode = 401;
    return next(authError);
    }
    const hasRoles = req.user.roles.some(role => requiredRole.includes(role));
    if (!hasRoles) {
        const forbidenError = new Error('You do not have the neccessary permissions.');
        forbidenError.statusCode = 403;
        return next(forbidenError);
    }
    next();
}

module.exports = authorizeRole;