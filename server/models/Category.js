import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subcategories: [{ type: String }],
  type: { type: String, enum: ['Main', 'Style', 'Lighting', 'Camera', 'Artist', 'Environment'], default: 'Main' }
}, { timestamps: true });

export default mongoose.model('Category', CategorySchema);
