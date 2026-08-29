const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const dbHelper = require('../models/dbHelper');

// Universal Login Router (TA & Student)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter both username and password' });
  }

  const queryUsername = username.trim();
  const queryPassword = password.trim();

  try {
    let user = null;

    // 1. Try to find the user in the User database (e.g. TA accounts like 'abdo')
    if (mongoose.connection.readyState === 1) {
      user = await User.findOne({ username: queryUsername.toLowerCase() });
    } else {
      user = await dbHelper.user.findOne({ username: queryUsername });
    }
    
    if (user) {
      if (user.password !== queryPassword) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
      return res.json({
        username: user.username,
        name: user.name,
        role: user.role
      });
    }

    // 2. If not found in User, check if a Student exists with this studentId as both username & password
    let student = null;
    if (mongoose.connection.readyState === 1) {
      student = await Student.findOne({ studentId: queryUsername });
    } else {
      student = await dbHelper.student.findOne({ studentId: queryUsername });
    }

    if (student && queryPassword === student.studentId) {
      return res.json({
        username: student.studentId,
        name: student.name,
        role: 'student'
      });
    }

    return res.status(401).json({ message: 'Invalid username or password' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'An internal server error occurred' });
  }
});

module.exports = router;
