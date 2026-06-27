export type AuthNavState = {
  isSignedIn: boolean;
  displayEmail: string | null;
  accountLabel: string | null;
  primaryLabel: "ログイン";
  primaryHref: "/login";
  settingsHref: "/settings";
};

export function getAuthNavState(email: string | null | undefined): AuthNavState {
  if (!email) {
    return {
      isSignedIn: false,
      displayEmail: null,
      accountLabel: null,
      primaryLabel: "ログイン",
      primaryHref: "/login",
      settingsHref: "/settings"
    };
  }

  const accountLabel = email.split("@")[0] || "Account";

  return {
    isSignedIn: true,
    displayEmail: email,
    accountLabel,
    primaryLabel: "ログイン",
    primaryHref: "/login",
    settingsHref: "/settings"
  };
}
