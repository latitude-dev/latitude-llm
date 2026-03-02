import { render } from "@react-email/components";

/**
 * Renders a React email component to HTML string
 * @param component - The React email component to render
 * @returns Promise resolving to HTML string
 */
export async function renderEmail(component: React.ReactElement): Promise<string> {
  return render(component);
}
