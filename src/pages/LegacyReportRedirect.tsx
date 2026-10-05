import { Navigate, useSearchParams } from "react-router-dom";

// Emails sent before the /report?token= -> /dashboard/:token link fix are
// already delivered with the old URL baked into their HTML -- redeploying
// the email template doesn't retroactively fix those. This keeps every
// already-sent "View Your Report" link working.
export default function LegacyReportRedirect() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  // Older emails were sent with a literal "undefined"/"null" when the token was missing.
  const valid = !!token && token !== "undefined" && token !== "null";
  return <Navigate to={valid ? `/dashboard/${token}` : "/gap-analysis"} replace />;
}
