-- Migration: Add destination and ETA columns to vessels table
-- Run this in Supabase SQL Editor if columns don't exist yet

ALTER TABLE vessels ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS eta TEXT;
