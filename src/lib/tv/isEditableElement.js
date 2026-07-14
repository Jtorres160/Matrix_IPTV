export function isEditableElement(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
}
