-- Add task timer tracking column
ALTER TABLE public.client_tasks
ADD COLUMN IF NOT EXISTS time_spent_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS timer_started_at timestamp with time zone;

-- Add priority column for smart queue sorting
ALTER TABLE public.client_tasks
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Create task notifications table
CREATE TABLE IF NOT EXISTS public.task_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_task_id uuid REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('sla_warning', 'sla_breach', 'dependency_unlocked', 'assigned', 'overdue')),
  title text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (admin-only feature)
CREATE POLICY "Allow all task notifications operations"
ON public.task_notifications
FOR ALL
USING (true)
WITH CHECK (true);