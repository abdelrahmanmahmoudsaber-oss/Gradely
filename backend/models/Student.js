const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  grades: [
    {
      subject: String,
      score: Number,
      maxScore: Number,
      absences: { type: [Number], default: [] }  // array of absent section numbers e.g. [1, 3, 7]
    }
  ]
});

module.exports = mongoose.model('Student', studentSchema);
