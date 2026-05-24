import { Schema, model } from 'mongoose';

/**
 * Mongoose Schema representing a customer.
 */
export const CustomerSchema = new Schema({
  name: { type: String, required: true },
  age: { type: Number, required: false },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

export const Customer = model('Customer', CustomerSchema);
