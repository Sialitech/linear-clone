import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function UserAvatar({
  user,
  className,
}: {
  user: { name: string | null; email: string | null; image: string | null } | null;
  className?: string;
}) {
  const label = user?.name || user?.email || "Unassigned";
  return (
    <Avatar className={cn("size-5", className)}>
      {user?.image ? <AvatarImage src={user.image} alt={label} /> : null}
      <AvatarFallback className="bg-white/10 text-[9px] font-medium text-foreground">
        {user ? initials(user.name, user.email) : "–"}
      </AvatarFallback>
    </Avatar>
  );
}
