const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '../db.json');

// Ensure db.json exists with default structures
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], students: [] }, null, 2), 'utf8');
}

function readData() {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { users: [], students: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

const dbHelper = {
  user: {
    findOne: async (query) => {
      const db = readData();
      if (query.username) {
        return db.users.find(u => u.username.toLowerCase() === query.username.toLowerCase());
      }
      return null;
    },
    save: async (userData) => {
      const db = readData();
      const existingIdx = db.users.findIndex(u => u.username.toLowerCase() === userData.username.toLowerCase());
      if (existingIdx !== -1) {
        db.users[existingIdx] = userData;
      } else {
        db.users.push(userData);
      }
      writeData(db);
      return userData;
    },
    deleteMany: async () => {
      const db = readData();
      db.users = [];
      writeData(db);
    }
  },
  student: {
    find: async () => {
      const db = readData();
      return db.students;
    },
    findOne: async (query) => {
      const db = readData();
      if (query.studentId) {
        return db.students.find(s => s.studentId === query.studentId);
      }
      return null;
    },
    save: async (studentData) => {
      const db = readData();
      const existingIdx = db.students.findIndex(s => s.studentId === studentData.studentId);
      if (existingIdx !== -1) {
        db.students[existingIdx] = studentData;
      } else {
        db.students.push(studentData);
      }
      writeData(db);
      return studentData;
    },
    findOneAndDelete: async (query) => {
      const db = readData();
      const idx = db.students.findIndex(s => s.studentId === query.studentId);
      if (idx !== -1) {
        const deleted = db.students.splice(idx, 1)[0];
        writeData(db);
        return deleted;
      }
      return null;
    },
    deleteMany: async () => {
      const db = readData();
      db.students = [];
      writeData(db);
    },
    insertMany: async (studentsList) => {
      const db = readData();
      db.students.push(...studentsList);
      writeData(db);
      return studentsList;
    }
  }
};

module.exports = dbHelper;
