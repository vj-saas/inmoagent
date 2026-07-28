/**
 * Índice de navegación — fuente única para el rail tipográfico, el overlay
 * mobile y la paleta de comandos (⌘K).
 *
 * La navegación de esta app NO usa íconos: usa un índice numerado, como el
 * sumario de una revista. El número no es decoración — es la dirección de la
 * sección (aparece en el rail, en el encabezado de la página y en la paleta),
 * y es lo que le permite a un operador diario memorizar el panel por posición
 * en vez de por pictograma.
 *
 * Los `label` son contrato: `AppLayout.test.tsx` los busca por texto exacto.
 */
export interface NavEntry {
  index: string;
  to: string;
  label: string;
  /** Descripción corta, solo visible en la paleta de comandos. */
  hint: string;
  ownerOnly?: boolean;
}

export interface NavGroup {
  label: string;
  entries: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Actividad',
    entries: [
      { index: '01', to: '/dashboard', label: 'Panel', hint: 'Métricas del período' },
      { index: '02', to: '/llamar-hoy', label: 'Llamar hoy', hint: 'Cola priorizada por urgencia' },
      { index: '03', to: '/agenda', label: 'Agenda', hint: 'Visitas propuestas y confirmadas' },
    ],
  },
  {
    label: 'Gestión',
    entries: [
      { index: '04', to: '/leads', label: 'Leads', hint: 'Bandeja de calificación' },
      { index: '05', to: '/propiedades', label: 'Propiedades', hint: 'Catálogo del tenant' },
    ],
  },
  {
    label: 'Administración',
    entries: [
      {
        index: '06',
        to: '/people',
        label: 'Gestión de personas',
        hint: 'Equipo y permisos',
        ownerOnly: true,
      },
      {
        index: '07',
        to: '/configuracion',
        label: 'Configuración',
        hint: 'Datos del tenant y WhatsApp',
        ownerOnly: true,
      },
    ],
  },
];

/** Grupos visibles según el rol: Administración es exclusiva de OWNER. */
export function visibleNavGroups(role: string | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => !entry.ownerOnly || role === 'OWNER'),
  })).filter((group) => group.entries.length > 0);
}

/**
 * Entrada correspondiente a una ruta. Usa prefijo para que `/leads/:id`
 * resuelva a "04 Leads" sin registrar cada detalle en el índice.
 */
export function navEntryForPath(pathname: string): NavEntry | undefined {
  const all = NAV_GROUPS.flatMap((group) => group.entries);
  return (
    all.find((entry) => entry.to === pathname) ??
    all.find((entry) => pathname.startsWith(`${entry.to}/`))
  );
}
