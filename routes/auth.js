const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { generateToken } = require('../utils/helpers');

// POST /api/auth/signup
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['admin', 'teacher', 'student']).withMessage('Invalid role'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array().map(e => e.msg).join(', ') });
    }

    const { name, email, password, role, department, year, semester, rollNumber, departments, subjects } = req.body;

    try {
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const userData = { name, email, password, role };

      // Student academic fields
      if (role === 'student') {
        if (department) userData.department = department;
        if (year) userData.year = parseInt(year);
        if (semester) userData.semester = parseInt(semester);
        if (rollNumber) userData.rollNumber = rollNumber;
      }

      // Teacher fields
      if (role === 'teacher') {
        if (departments) userData.departments = departments;
        if (subjects) userData.subjects = subjects;
      }

      const user = await User.create(userData);
      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id, name: user.name, email: user.email, role: user.role,
          department: user.department, year: user.year, semester: user.semester, rollNumber: user.rollNumber,
          departments: user.departments, subjects: user.subjects,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array().map(e => e.msg).join(', ') });
    }

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.matchPassword(password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: 'Account is deactivated' });
      }

      const token = generateToken(user._id);

      // Log login event
      await ActivityLog.create({
        user: user._id,
        event: 'login',
        details: `Login from ${req.ip}`,
        ipAddress: req.ip,
      }).catch(() => {}); // silent fail

      res.json({
        token,
        user: {
          id: user._id, name: user.name, email: user.email, role: user.role,
          department: user.department, year: user.year, semester: user.semester, rollNumber: user.rollNumber,
          departments: user.departments, subjects: user.subjects,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// GET /api/auth/me
router.get('/me', require('../middleware/auth').protect, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
