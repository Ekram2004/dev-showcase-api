const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator'); 
const { query } = require('../../config/db');
const authenticateToken = require('../../middleware/autonticateToken');
const authorizeRole = require('../../middleware/authorizeToken');


const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const validationError = new Error('Validation failed');
        validationError.statusCode = 400;
        validationError.isValidationError = true;
        return next(validationError);
    }
    next();
}


router.get('/',async (req, res, next) => {
    try {
        const allSkills = await query(
          "SELECT id, name FROM skills ORDER BY name ASC"
        );
        if (allSkills.rows.length === 0) {
            const missingValueError = new Error('not skill founds');
            missingValueError.statusCode = 401;
            return next(missingValueError);
        }
        res.json(allSkills.rows);
    } catch (err) {
        next(err);
    }
});
router.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    try {
        const skill = await query('SELECT id, name FROM skills WHERE id = $1', [id]);
        if (skill.rows.length === 0) {
            const notFoundError = new Error('Skill not found.');
            notFoundError.statusCode = 404;
            return next(notFoundError);
        }
        res.json(skill.rows[0]);
    } catch (error) {
        next(error);
    }
});

router.post('/', authenticateToken, authorizeRole(['admin']), [
    body('name').trim().notEmpty().withMessage('Skill name is required.').isLength({ min: 2, max: 100 }).withMessage('Skill must be between 2 and 100 characters.')
], handleValidationErrors, async (req, res, next) => {
    const { name } = req.body;
    try {
        const existingSkill = await query('SELECT id FROM skills WHERE name = $1', [name]);
        if (existingSkill.rows.length > 0) {
            const conflictError = new Error('skill with this name already exists');
            conflictError.statusCode = 409;
            return next(conflictError);
        }
        const newSkill = await query('INSERT INTO skills(name) VALUES ($1) RETURNING id, name', [name]);
        res.status(201).json(newSkill.rows[0]);
    } catch (error) {
        next(error);
    }
});


router.put('/:id', authenticateToken, authorizeRole(['admin']), [
    body('name').trim().notEmpty().withMessage('Skill name is required.').isLength({ min: 2, max: 100 }).withMessage('Skill name must be between 2 and 100 characters.')
], handleValidationErrors, async (req, res, next) => {
    const { name } = req.body;
    const { id } = req.params;
    try {
        const existingSkill = await query('SELECT id FROM skills WHERE name = $1 AND id != $2'[name, id]);
        if (existingSkill.rows.length > 0) {
            const conflictError = new Error('Skill with this name already exists.');
            conflictError.statusCode = 409;
            return next(conflictError);
        }
        const updatedSkill = await query('UPDATE skills SET name = $1 WHERE id = $2 RETURNING id, name', [name, id]);
        if (updatedSkill.rows.length === 0) {
            const notFoundError = new Error('Skill not found.');
            notFoundError.statusCode = 404;
            return next(notFoundError);
        }
        res.json(updatedSkill.rows[0]);
    } catch (error) {
        next(error);
    }
}
);

router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res, next) => {
    const { id } = req.params;
    try {
        const deletedSkill = await query('DELETE FROM skills WHERE id = $1 RETURNING id', [id]);
        if (deletedSkill.rows.length === 0) {
            const notFoundError = new Error('Skill not found.');
      notFoundError.statusCode = 404;
      return next(notFoundError);
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
})


module.exports = router;