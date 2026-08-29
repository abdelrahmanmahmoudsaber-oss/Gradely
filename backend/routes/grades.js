const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const dbHelper = require('../models/dbHelper');

// Get all students (for TA dashboard)
router.get('/', async (req, res) => {
  try {
    let students = [];
    if (mongoose.connection.readyState === 1) {
      students = await Student.find({});
    } else {
      students = await dbHelper.student.find();
    }
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving student listing' });
  }
});

// Get student by ID
router.get('/:studentId', async (req, res) => {
  const queryId = req.params.studentId.trim();
  try {
    let student = null;
    if (mongoose.connection.readyState === 1) {
      student = await Student.findOne({ studentId: queryId });
    } else {
      student = await dbHelper.student.findOne({ studentId: queryId });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found with this ID' });
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'An internal server error occurred' });
  }
});

// Create a new student
router.post('/', async (req, res) => {
  const { studentId, name } = req.body;

  if (!studentId || !name) {
    return res.status(400).json({ message: 'Both Student ID and Name are required' });
  }

  const queryId = studentId.trim();
  const queryName = name.trim();

  try {
    let existingStudent = null;
    if (mongoose.connection.readyState === 1) {
      existingStudent = await Student.findOne({ studentId: queryId });
    } else {
      existingStudent = await dbHelper.student.findOne({ studentId: queryId });
    }

    if (existingStudent) {
      return res.status(400).json({ message: 'Student ID is already registered' });
    }

    const newStudentData = {
      studentId: queryId,
      name: queryName,
      grades: []
    };

    if (mongoose.connection.readyState === 1) {
      const newStudent = new Student(newStudentData);
      await newStudent.save();
      res.status(201).json(newStudent);
    } else {
      await dbHelper.student.save(newStudentData);
      res.status(201).json(newStudentData);
    }
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ message: 'Error adding student profile' });
  }
});

// Update student grades / information
router.put('/:studentId', async (req, res) => {
  const { name, grades } = req.body;
  const queryId = req.params.studentId.trim();
  
  try {
    let student = null;
    if (mongoose.connection.readyState === 1) {
      student = await Student.findOne({ studentId: queryId });
    } else {
      student = await dbHelper.student.findOne({ studentId: queryId });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    // Update
    if (name !== undefined) student.name = name.trim();
    if (grades !== undefined) student.grades = grades;

    if (mongoose.connection.readyState === 1) {
      await student.save();
    } else {
      await dbHelper.student.save(student);
    }

    res.json(student);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Error saving student modifications' });
  }
});

// Delete student
router.delete('/:studentId', async (req, res) => {
  const queryId = req.params.studentId.trim();
  try {
    let deletedStudent = null;
    if (mongoose.connection.readyState === 1) {
      deletedStudent = await Student.findOneAndDelete({ studentId: queryId });
    } else {
      deletedStudent = await dbHelper.student.findOneAndDelete({ studentId: queryId });
    }

    if (!deletedStudent) {
      return res.status(404).json({ message: 'Student profile not found' });
    }
    res.json({ message: 'Student profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: 'Error deleting student profile' });
  }
});

module.exports = router;
