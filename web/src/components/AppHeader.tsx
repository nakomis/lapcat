import logo from '@/assets/lapcat-logo.png';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  onSignOut: () => void;
}

function AppHeader({ onSignOut }: AppHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      <img src={logo} alt="Lapcat" className="h-9 w-9 rounded-md" />
      <span className="flex-1 text-lg font-semibold">Lapcat</span>
      <Button variant="outline" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </header>
  );
}

export default AppHeader;
