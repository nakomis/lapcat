/**
 * Cognito Managed Login (v2) branding for the web portal client — the One Dark
 * theme used by the rest of the nakomis estate, copied from nakostat's web
 * client. Colours are defined under `darkMode` only: the schema has no
 * light-mode colour properties, and `colorSchemeMode: 'DARK'` forces this
 * palette even when the device is in light mode.
 */
export const webLoginBrandingSettings = {
  components: {
    pageBackground: {
      image: { enabled: false },
      darkMode: { color: '282c34ff' },
    },
    pageHeader: {
      backgroundImage: { enabled: false },
      logo: { location: 'START', enabled: false },
      darkMode: { background: { color: '21252bff' }, borderColor: '3e4451ff' },
    },
    pageFooter: {
      backgroundImage: { enabled: false },
      logo: { location: 'START', enabled: false },
      darkMode: { background: { color: '21252bff' }, borderColor: '3e4451ff' },
    },
    form: {
      borderRadius: 8,
      backgroundImage: { enabled: false },
      logo: { location: 'CENTER', position: 'TOP', enabled: false, formInclusion: 'IN' },
      darkMode: { backgroundColor: '2c313aff', borderColor: '3e4451ff' },
    },
    pageText: {
      darkMode: { bodyColor: 'abb2bfff', headingColor: 'ffffffff', descriptionColor: '5c6370ff' },
    },
    primaryButton: {
      darkMode: {
        defaults: { backgroundColor: '2563ebff', textColor: 'ffffffff' },
        hover:    { backgroundColor: '1d4ed8ff', textColor: 'ffffffff' },
        active:   { backgroundColor: '1e40afff', textColor: 'ffffffff' },
        disabled: { backgroundColor: '2c313aff', borderColor: '3e4451ff' },
      },
    },
    secondaryButton: {
      darkMode: {
        defaults: { backgroundColor: '2c313aff', borderColor: '3e4451ff', textColor: 'abb2bfff' },
        hover:    { backgroundColor: '353b45ff', borderColor: '528bffff', textColor: 'ffffffff' },
        active:   { backgroundColor: '21252bff', borderColor: '3e4451ff', textColor: 'ffffffff' },
      },
    },
    alert: {
      borderRadius: 4,
      darkMode: { error: { backgroundColor: '3a1515ff', borderColor: 'e06c75ff' } },
    },
    idpButton: {
      standard: {
        darkMode: {
          defaults: { backgroundColor: '2c313aff', borderColor: '3e4451ff', textColor: 'abb2bfff' },
          hover:    { backgroundColor: '353b45ff', borderColor: '528bffff', textColor: 'ffffffff' },
          active:   { backgroundColor: '21252bff', borderColor: '3e4451ff', textColor: 'ffffffff' },
        },
      },
      custom: {},
    },
    phoneNumberSelector: { displayType: 'TEXT' },
    favicon: { enabledTypes: ['ICO', 'SVG'] },
  },
  componentClasses: {
    input: {
      borderRadius: 6,
      darkMode: {
        defaults: { backgroundColor: '21252bff', borderColor: '3e4451ff' },
        placeholderColor: '5c6370ff',
      },
    },
    inputLabel: {
      darkMode: { textColor: 'abb2bfff' },
    },
    inputDescription: {
      darkMode: { textColor: '5c6370ff' },
    },
    link: {
      darkMode: { defaults: { textColor: '61afefff' }, hover: { textColor: '528bffff' } },
    },
    optionControls: {
      darkMode: {
        defaults: { backgroundColor: '21252bff', borderColor: '3e4451ff' },
        selected: { backgroundColor: '2563ebff', foregroundColor: 'ffffffff' },
      },
    },
    focusState: {
      darkMode: { borderColor: '528bffff' },
    },
  },
  categories: {
    global: {
      colorSchemeMode: 'DARK',
      pageFooter: { enabled: false },
      pageHeader: { enabled: false },
      spacingDensity: 'REGULAR',
    },
  },
};
