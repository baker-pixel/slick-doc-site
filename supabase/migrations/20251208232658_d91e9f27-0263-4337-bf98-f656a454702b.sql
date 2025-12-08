-- Add signature_data column to store base64 signature
ALTER TABLE public.service_agreements 
ADD COLUMN IF NOT EXISTS signature_data text,
ADD COLUMN IF NOT EXISTS signer_name text,
ADD COLUMN IF NOT EXISTS signer_ip text;