require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');
const User = require('./models/User');
const dbHelper = require('./models/dbHelper');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gradely';

const taUserData = {
  username: 'abdo',
  password: 'abdo',
  name: 'Abdelrahman Saber',
  role: 'ta'
};

const studentsData = [
  {
    studentId: '1001',
    name: 'Ahmed Yusuf',
    grades: [
      { subject: 'Mathematics I', score: 95, maxScore: 100 },
      { subject: 'General Physics', score: 88, maxScore: 100 },
      { subject: 'Structured Programming', score: 92, maxScore: 100 }
    ]
  },
  {
    studentId: '1002',
    name: 'Sarah Ali',
    grades: [
      { subject: 'Mathematics I', score: 78, maxScore: 100 },
      { subject: 'General Physics', score: 85, maxScore: 100 },
      { subject: 'Structured Programming', score: 90, maxScore: 100 }
    ]
  },
  {
    studentId: '1003',
    name: 'Mohamed Mostafa',
    grades: [
      { subject: 'Mathematics I', score: 62, maxScore: 100 },
      { subject: 'General Physics', score: 74, maxScore: 100 },
      { subject: 'Structured Programming', score: 80, maxScore: 100 }
    ]
  }
];

async function seedLocalJSON() {
  console.log('Seeding local JSON database...');
  await dbHelper.user.deleteMany({});
  await dbHelper.student.deleteMany({});
  await dbHelper.user.save(taUserData);
  await dbHelper.student.insertMany(studentsData);
  console.log('Seeded local JSON database (db.json) successfully in English!');
}

async function startSeeding() {
  // Always seed local JSON first as it is bulletproof
  await seedLocalJSON();

  console.log('Trying to connect to MongoDB...');
  try {
    const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('Connected to MongoDB successfully. Seeding MongoDB...');
    
    await Student.deleteMany({});
    await User.deleteMany({});
    
    const taUser = new User(taUserData);
    await taUser.save();
    
    await Student.insertMany(studentsData);
    console.log('Seeded MongoDB successfully in English!');
    process.exit(0);
  } catch (err) {
    console.warn('MongoDB connection timed out or failed. Skipped MongoDB seeding.');
    console.log('Local JSON database was successfully seeded. You can run the app without MongoDB!');
    process.exit(0);
  }
}

startSeeding();
