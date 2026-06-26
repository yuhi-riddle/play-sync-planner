export type AuthNavState = {
  isSignedIn: boolean;
  displayEmail: string | null;
  accountLabel: string | null;
  primaryLabel: "ログイン" | "設定";
  primaryHref: "/login" | "/settings";
};

export function getAuthNavState(email: string | null | undefined): AuthNavState {
  if (!email) {
    return {
      isSignedIn: false,
      displayEmail: null,
      accountLabel: null,
      primaryLabel: "ログイン",
      primaryHref: "/login"
    };
  }

  const accountLabel = email.split("@")[0] || "Account";

  return {
    isSignedIn: true,
    displayEmail: email,
    accountLabel,
    primaryLabel: "設定",
    primaryHref: "/settings"
  };
}
