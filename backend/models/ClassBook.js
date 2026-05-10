const mongoose = require('mongoose');

const classBookSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  class_id: { type: Number, required: true },
  book_name: { type: String, required: true },
  publisher: String,
  image_path: String
});

module.exports = mongoose.model('ClassBook', classBookSchema);
