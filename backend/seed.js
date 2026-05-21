require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB for seeding');
    await Student.deleteMany({});
    
    const students = [
      {
        studentId: '1001',
        name: 'Ahmed Youssef',
        grades: [
          { subject: 'Math', score: 95, maxScore: 100 },
          { subject: 'Science', score: 88, maxScore: 100 },
          { subject: 'English', score: 92, maxScore: 100 }
        ]
      },
      {
        studentId: '1002',
        name: 'Sara Ali',
        grades: [
          { subject: 'Math', score: 78, maxScore: 100 },
          { subject: 'Science', score: 85, maxScore: 100 },
          { subject: 'English', score: 90, maxScore: 100 }
        ]
      }
    ];

    await Student.insertMany(students);
    console.log('Database seeded successfully');
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
