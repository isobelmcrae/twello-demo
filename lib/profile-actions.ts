"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import type { ActionResult } from "@/lib/types";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  image: z.string().url().max(2000).refine(url => url.startsWith("https://"), "Use an HTTPS image URL.").nullable(),
  bio: z.string().trim().max(500),
  avatarColor: z.enum(["yellow", "pink", "blue", "green", "violet"]),
});

export async function saveProfile(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check your profile details." };
  try {
    const user = await requireUser();
    const profile = parsed.data;
    await transaction(async client => {
      await client.query('UPDATE "user" SET name=$1, image=$2, "updatedAt"=now() WHERE id=$3', [profile.name, profile.image, user.id]);
      await client.query('INSERT INTO profile(user_id,bio,avatar_color) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,avatar_color=excluded.avatar_color', [user.id, profile.bio, profile.avatarColor]);
    });
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Your profile could not be saved. Sign in and try again." };
  }
}
