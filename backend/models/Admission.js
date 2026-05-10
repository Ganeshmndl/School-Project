const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  class_applied: { type: String, required: true },
  dob: { type: String, required: true },
  parent_first_name: { type: String, required: true },
  parent_last_name: { type: String, required: true },
  address: String,
  city: String,
  state: String,
  phone: { type: String, required: true },
  email: { type: String, required: true },
  created_at: { type: String, required: true }
});

module.exports = mongoose.model('Admission', admissionSchema);
