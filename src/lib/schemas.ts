import { z } from "zod";
import { ADMIN_PERMS } from "./api";

export const EVENT_TYPES = ["전체정기모임", "워크숍", "소모임"] as const;

export const memberBody = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.string().max(40).default(""),
  position: z.string().max(40).default(""),
  gender: z.string().max(10).default(""),
  company: z.string().max(80).default(""),
  title: z.string().max(40).default(""),
  birth: z.string().max(20).default(""),
  phone: z.string().max(30).default(""),
  ageGroup: z.string().max(20).default(""),
  perms: z.array(z.enum(ADMIN_PERMS)).default([]),
});
