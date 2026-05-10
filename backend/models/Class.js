const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  class_name: { type: String, required: true },
  age_group: String,
  session: String,
  created_at: { type: String, required: true }
});

module.exports = mongoose.model('Class', classSchema);
