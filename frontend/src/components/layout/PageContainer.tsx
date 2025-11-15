import type { FC, ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

// Maintains consistent horizontal spacing.
const PageContainer: FC<PageContainerProps> = ({ children }) => (
  <div className="page-container">{children}</div>
);

export default PageContainer;
