import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import the dataset
import * as dataset from '../../src/services/promptEngine/dataset.js';
import Category from '../models/Category.js';

async function seedCategories() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    console.log('Clearing old categories...');
    await Category.deleteMany({});

    console.log('Seeding new categories from dataset...');

    const categoriesToInsert = [];

    // Assuming dataset exports mainCategories, styleCategories, etc.
    for (const [exportName, categoryData] of Object.entries(dataset)) {
      // Determine type based on export name
      let type = 'Main';
      if (exportName.toLowerCase().includes('style')) type = 'Style';
      else if (exportName.toLowerCase().includes('light')) type = 'Lighting';
      else if (exportName.toLowerCase().includes('camera')) type = 'Camera';
      else if (exportName.toLowerCase().includes('artist')) type = 'Artist';
      else if (exportName.toLowerCase().includes('environment')) type = 'Environment';

      if (typeof categoryData === 'object' && !Array.isArray(categoryData)) {
        for (const [name, subcategories] of Object.entries(categoryData)) {
          categoriesToInsert.push({
            name,
            subcategories: Array.isArray(subcategories) ? subcategories : [],
            type
          });
        }
      }
    }

    if (categoriesToInsert.length > 0) {
      await Category.insertMany(categoriesToInsert);
      console.log(`✅ Successfully seeded ${categoriesToInsert.length} categories!`);
    } else {
      console.log('⚠️ No categories found to seed.');
    }

    mongoose.disconnect();
    console.log('Done.');
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
}

seedCategories();
