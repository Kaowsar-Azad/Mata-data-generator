import React, { useState } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { ControlPanel } from './ControlPanel';
import { ResultsPanel } from './ResultsPanel';
import { generatePrompts } from '../../services/promptEngine/generator';
import { motion } from 'framer-motion';

export const PromptEnginePage = ({ apiKeys, apiProvider }) => {
  const [prompts, setPrompts] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleGenerate = async (config) => {
    setIsGenerating(true);
    setStatusText('Preparing prompt rules...');
    setPrompts([]);
    try {
      await new Promise(r => setTimeout(r, 220));
      setStatusText('Blending category, style and lighting...');
      await new Promise(r => setTimeout(r, 320));
      setStatusText('Building unique prompt variations...');
      const newPrompts = generatePrompts(config);
      await new Promise(r => setTimeout(r, 200));
      setPrompts(newPrompts);
    } catch (err) {
      console.error('Failed to generate prompts:', err);
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const schemaMarkup = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MetadataPro Prompt Generator',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    description: 'Advanced offline AI prompt generator for stock photos, videos, and illustrations.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', ratingCount: '150', bestRating: '5', worstRating: '1' },
  };

  return (
    <HelmetProvider>
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '12px 14px 10px',
        boxSizing: 'border-box', gap: '10px',
        overflow: 'hidden',
      }}>
        <Helmet>
          <title>AI Prompt Generator | MetadataPro</title>
          <meta name="description" content="Generate highly optimized, unique AI prompts for stock photography and video in bulk, entirely offline." />
          <script type="application/ld+json">{JSON.stringify(schemaMarkup)}</script>
        </Helmet>



        {/* ── Main: Control + Results ── */}
        <div style={{ flex: 1, display: 'flex', gap: '12px', minHeight: 0 }}>
          <motion.div 
            initial={{ opacity: 0, x: -30 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{ height: '100%', flexShrink: 0 }}
          >
            <ControlPanel
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 30 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
            style={{ flex: 1, height: '100%', minWidth: 0 }}
          >
            <ResultsPanel
              prompts={prompts}
              onClear={() => setPrompts([])}
              isGenerating={isGenerating}
              statusText={statusText}
              apiKeys={apiKeys}
              apiProvider={apiProvider}
            />
          </motion.div>
        </div>
      </div>
    </HelmetProvider>
  );
};
