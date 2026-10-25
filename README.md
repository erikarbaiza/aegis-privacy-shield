# AEGIS Privacy Shield

Extensión de navegador que evita que tus datos personales y tus claves lleguen a ChatGPT, Claude, Gemini o Copilot sin que te des cuenta.

Antes de que un mensaje salga de tu navegador, AEGIS cambia los datos sensibles por etiquetas (`[EMAIL_ADDRESS_1]`, `[DNI_1]`...). La IA ve las etiquetas en lugar de los datos detectados. Cuando responde, AEGIS repone tus datos reales en tu pantalla, así que sigues recibiendo la respuesta completa.

```
Tú escribes:      Mi DNI es 12345678Z y mi email erik@correo.com
La IA recibe:     Mi DNI es [DNI_1] y mi email [EMAIL_ADDRESS_1]
Tú ves:           (la respuesta con tus datos reales ya repuestos)
```

La detección se hace en tu navegador. No hace falta ningún servidor ni ninguna cuenta.

**Pruébalo sin instalar nada:** [demo en el navegador](https://erikarbaiza.github.io/aegis-privacy-shield/demo.html)

## Instalar (Chrome o Edge)

AEGIS todavía no está en las tiendas de extensiones, así que se instala a mano. Son tres minutos.

1. Descarga el `.zip` de la [última versión](https://github.com/erikarbaiza/aegis-privacy-shield/releases/latest) y descomprímelo en una carpeta que no vayas a borrar.
2. Abre `chrome://extensions` (en Edge, `edge://extensions`) y activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esa carpeta.
4. **Recarga** las pestañas de ChatGPT, Claude o Gemini que tuvieras abiertas: la extensión solo actúa en las páginas que se cargan después de instalarla.

Para actualizar, descarga el zip nuevo, reemplaza los archivos de la carpeta y pulsa el botón de recargar de AEGIS en `chrome://extensions`.

## Cómo comprobar que funciona

Abre el menú de AEGIS (el icono del escudo) con una pestaña de ChatGPT, Claude, Gemini u Outlook delante. Debajo del interruptor de "Confiar en…" hay una línea que te dice qué pasa en esa pestaña:

- **"AEGIS activo en esta pestaña… cuadro de texto encontrado"** (verde): todo en orden.
- **"AEGIS NO está activo en esta pestaña"** (rojo): la extensión no se ha cargado en la página. Mira la sección de problemas más abajo.

Una prueba rápida: escribe `Mi DNI es 12345678Z` en ChatGPT y envíalo. Debería aparecer un aviso verde abajo a la derecha, y la respuesta deberá mostrar el DNI repuesto. Puedes pedirle a la propia IA que te diga si el primer carácter de ese dato es una cifra o un corchete: si ve un corchete, no ha recibido el dato real.

## Qué detecta

20 patrones. Los datos con formato comprobable (IBAN, tarjeta, DNI/NIE) se validan con algoritmos para evitar falsos positivos.

- **Datos personales (7):** email, IBAN (mod-97), tarjeta bancaria (Luhn), teléfono, DNI/NIE (letra de control), IPv4 pública y dirección postal.
- **Direcciones (detección aproximada):** tipo de vía + nombre con mayúsculas + número (`Calle Mayor 5, 3º B`), o un código postal con prefijo (`CP 48001`). No detecta direcciones sin número ni escritas en minúsculas, y deja sin cambiar el nombre de la ciudad.
- **Secretos (13):** claves de OpenAI, Anthropic, AWS, Google, Stripe y GitHub, tokens JWT, Bearer y Slack, claves privadas, contraseñas en código, cadenas de conexión MongoDB, client secrets de OAuth.
- Avisa también si pegas nombres de archivos sensibles (`.env`, `id_rsa`, `credentials.json`...).

## Dónde funciona

- **Probado (en Edge):** chatgpt.com, claude.ai, gemini.google.com y Outlook Web.
- **Preparado, sin verificar a fondo:** copilot.microsoft.com y Gmail.

## Modos

- **Seguro:** solo protege credenciales y claves.
- **Equilibrado:** protege también datos personales (por defecto).
- **Estricto:** pide confirmación antes de enviar un mensaje con datos sensibles.
- **Silencioso:** protege igual, pero sin avisos visuales.

También puedes marcar sitios de confianza en los que AEGIS no actúa, ver un historial de lo que ha protegido y exportarlo (CSV o informe).

## Si no funciona

- **Recarga la pestaña.** Tras instalar o actualizar la extensión, las pestañas ya abiertas siguen sin ella hasta que las recargas.
- **Mira la línea del menú.** Te dice si AEGIS está activo en esa pestaña.
- **En Edge, comprueba el permiso por sitio.** Pulsa el icono de la pieza de puzle de la barra de herramientas: si pone "Permitir extensiones en este sitio" y está apagado, Edge bloquea todas las extensiones en esa página. Enciéndelo y recarga.
- **No está activa en ventanas InPrivate** a menos que lo permitas en los detalles de la extensión.
- **Comprueba que el sitio no esté en tu lista de confianza.** El menú tiene un interruptor "Confiar en este sitio"; si está encendido, AEGIS no actúa ahí.
- Si nada de esto lo arregla, [abre una incidencia](https://github.com/erikarbaiza/aegis-privacy-shield/issues/new/choose) con lo que dice la línea del menú.

## Privacidad

Todo se procesa en tu navegador. No hay servidor, cuentas, analíticas ni telemetría. El detalle de qué guarda la extensión y qué permisos usa está en [PRIVACY.md](PRIVACY.md).

## Límites conocidos

- AEGIS cambia lo que la web **envía**. No puede impedir que el código de la propia web lea lo que escribes en su cuadro de texto antes de pulsar enviar. Está pensada para evitar que compartas datos por descuido a través del envío normal del chat, no para defenderte de una web que quiera espiarte activamente.
- La detección local no reconoce nombres propios. Las direcciones solo se detectan con el formato descrito arriba. Para una detección semántica existe un modo opcional con servidor, que no se incluye en este repositorio.
- No cubre texto transcrito de voz. Cuando los datos llegan fragmentados (un DNI dicho poco a poco entre turnos de una llamada), el detector no los reconoce, porque busca cada dato completo y con su formato.
- Sustituir identificadores es seudonimización, no anonimización: los datos seudonimizados siguen siendo datos personales según el RGPD, y AEGIS no evalúa el riesgo de reidentificar a alguien cruzando varios datos. No es una herramienta de cumplimiento normativo.
- Depende de cómo está construida cada web. Si una IA cambia el diseño de su cuadro de texto o la forma de enviar los mensajes, la extensión puede dejar de enganchar hasta que se actualice. Ya pasó con ChatGPT y con Claude.
- No está publicada en ninguna tienda de extensiones. Es un proyecto personal en fase de prueba.

## Permisos

- `storage`: guardar tus ajustes y el historial en tu navegador.
- `activeTab`: leer el sitio de la pestaña activa cuando abres el menú.
- Acceso a los sitios de la lista de arriba, solo para interceptar lo que escribes en ellos.
- Acceso a un servidor propio: es un permiso **opcional**. El navegador te lo pide únicamente si guardas o pruebas una URL de servidor en el menú. Sin servidor, no se pide.

## Desarrollo

Sin dependencias ni paso de compilación: son archivos JavaScript y HTML.

- `demo.html`: demo independiente con ejemplos. Funciona abriéndola en cualquier navegador.
- `test-runner.html`: abre este archivo en un navegador y pulsa "Ejecutar tests". Incluye casos de acierto y de falso positivo para cada tipo de dato, con recall y precisión por tipo.
- `manifest.json`, `content.js`, `fetch-interceptor.js`, `service-worker.js`, `popup.html`, `popup.js`: la extensión.

Registro de depuración opcional: en la consola de una página compatible, `localStorage.aegisDebug = "1"` activa trazas de lo que hace AEGIS (nunca escribe los valores detectados) y un cartel de presencia al cargar la página.

## Contribuir

Las incidencias y las propuestas son bienvenidas, sobre todo si encuentras un sitio donde no funciona o un dato que debería detectar y no detecta. Mira el [registro de cambios](CHANGELOG.md) para ver lo último.

## Licencia

[MIT](LICENSE)
