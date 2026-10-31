import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

// Every fact on the site lives here. A fact without an official source or a
// check date fails the build, so nothing unsourced can reach a page.
const facts = defineCollection({
  loader: file('src/data/facts.json'),
  schema: z.object({
    id: z.string(),
    category: z.enum([
      'companies-house-fees',
      'identity-verification',
      'company-name-rules',
      'companies-house-api',
      'registration-providers',
    ]),
    label: z.string().min(1),
    value: z.union([z.number(), z.string().min(1)]),
    unit: z.enum(['GBP', 'date', 'text', 'characters']),
    notes: z.string().optional(),
    source_url: z.string().url(),
    source_title: z.string().min(1),
    checked_on: z.coerce.date(),
  }),
});

const dataUpdates = defineCollection({
  loader: file('src/data/data-updates.json'),
  schema: z.object({
    id: z.string(),
    date: z.coerce.date(),
    title: z.string().min(1),
    changes: z.array(z.string().min(1)).min(1),
  }),
});

export const collections = { facts, dataUpdates };
