const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  qualification: String,
  subject: String,
  photo: String
});

module.exports = mongoose.model('Teacher', teacherSchema);
