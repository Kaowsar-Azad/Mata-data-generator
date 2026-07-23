import mongoose from 'mongoose';

const PromptVocabularySchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Subject', 'Action', 'Environment', 'Concept', 'Style', 'Lighting', 'Camera'],
    index: true
  }
}, { timestamps: true });

const PromptVocabulary = mongoose.model('PromptVocabulary', PromptVocabularySchema);
export default PromptVocabulary;
