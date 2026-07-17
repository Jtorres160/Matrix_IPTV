// Runs `action` if entitled, otherwise routes to the upsell. One-line gate
// call shape shared by every locked feature (Record button, Recordings,
// 2nd+ source).
export function requirePro(isProFn, action, openUpsell) {
  if (isProFn()) {
    action();
  } else {
    openUpsell();
  }
}
