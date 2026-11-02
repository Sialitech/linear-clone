import AuthScreen from "@/components/auth-screen";

export default function LoginPage() {
  return (
    <AuthScreen mode="signIn" passwordEnabled={process.env.VERCEL_ENV !== "production"} />
  );
}
