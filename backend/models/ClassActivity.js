const mongoose = require('mongoose');

const classActivitySchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  class_id: { type: Number, required: true },
  activity_name: { type: String, required: true }
});

module.exports = mongoose.model('ClassActivity', classActivitySchema);
