import AuthScreen from "@/components/auth-screen";

export default function SignupPage() {
  return (
    <AuthScreen mode="signUp" passwordEnabled={process.env.VERCEL_ENV !== "production"} />
  );
}