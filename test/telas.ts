import './audit-setup';
import { FORMS } from '../src/ui/screens/Configuracoes';
import { CURVAS } from '../src/ui/screens/Curva';
import { TABELAS } from '../src/ui/screens/MapaInjecao';
import { SUBMENUS } from '../src/ui/screens/SubMenu';
import { TITLES } from '../src/ui/App';
const ids = [...Object.keys(TITLES), ...Object.keys(SUBMENUS), ...Object.keys(FORMS).map((k) => 'f_' + k), ...Object.keys(CURVAS).map((k) => 'c_' + k), ...Object.keys(TABELAS).map((k) => 't_' + k)];
console.log(JSON.stringify([...new Set(ids)]));
