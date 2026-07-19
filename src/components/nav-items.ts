import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  Repeat,
  LineChart,
  Target,
  Calendar,
  BarChart3,
  Settings,
  HandCoins,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Receitas", to: "/receitas", icon: TrendingUp },
  { title: "Despesas", to: "/despesas", icon: TrendingDown },
  { title: "Transferências", to: "/transferencias", icon: ArrowLeftRight },
  { title: "Resgates", to: "/resgates", icon: HandCoins },
  { title: "Contas", to: "/contas", icon: Wallet },
  { title: "Cartões", to: "/cartoes", icon: CreditCard },
  { title: "Recorrências", to: "/recorrencias", icon: Repeat },
  { title: "Investimentos", to: "/investimentos", icon: LineChart },
  { title: "Metas", to: "/metas", icon: Target },
  { title: "Calendário", to: "/calendario", icon: Calendar },
  { title: "Relatórios", to: "/relatorios", icon: BarChart3 },
  { title: "Configurações", to: "/configuracoes", icon: Settings },
];

export const bottomNavItems: NavItem[] = [
  { title: "Início", to: "/dashboard", icon: LayoutDashboard },
  { title: "Receitas", to: "/receitas", icon: TrendingUp },
  { title: "Despesas", to: "/despesas", icon: TrendingDown },
  { title: "Cartões", to: "/cartoes", icon: CreditCard },
];