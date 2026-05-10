const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  student_name: { type: String, required: true },
  address: { type: String, required: true },
  class: { type: String, required: true },
  roll_number: { type: String, required: true },
  receipt: String,
  created_at: { type: String, required: true }
});

module.exports = mongoose.model('Payment', paymentSchema);
