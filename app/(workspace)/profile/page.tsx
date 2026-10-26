import { requirePageUser } from "@/lib/auth";
import { getProfile } from "@/lib/boards";
import { ProfileForm } from "@/components/workspace/profile-form";
export default async function ProfilePage(){const user=await requirePageUser();return <ProfileForm user={{...user,image:user.image??null}} profile={await getProfile(user.id)}/>;}
