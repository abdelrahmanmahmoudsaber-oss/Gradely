const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  grades: [
    {
      subject: String,
      score: Number,
      maxScore: Number
    }
  ]
});

module.exports = mongoose.model('Student', studentSchema);
