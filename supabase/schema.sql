-- Bemcru Learning Centre registration database
-- Run this in Supabase SQL Editor before switching the website away from Apps Script.

create extension if not exists pgcrypto;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_name text not null,
  date_of_birth text not null,
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text not null,
  level text not null,
  school_name text not null,
  pathway text,
  grade text not null,
  session text not null,
  subjects text[] not null default '{}',
  preferred_start_date text not null,
  payment_reference text,
  notes text,
  consent boolean not null default false,
  whatsapp_notification_status text not null default 'pending'
    check (whatsapp_notification_status in ('pending', 'sent', 'failed'))
);

alter table public.registrations enable row level security;

-- No public policies are created: anonymous visitors cannot read registrations.
-- The Edge Function writes using a server-side service-role key, which must never
-- be placed in website HTML or committed to GitHub.
