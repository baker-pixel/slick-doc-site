-- Drop the unique constraint on email to allow same email with different business names
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_email_key;

-- Add a new unique constraint on email + business_name combination
ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_email_business_unique UNIQUE (email, business_name);