# Política de privacidad

AEGIS Privacy Shield es una extensión de navegador de código abierto. Este documento describe qué hace con tus datos. Si el código y este texto no coinciden, es un error de este texto: avísalo en las [incidencias](https://github.com/erikarbaiza/aegis-privacy-shield/issues).

## Resumen

- Todo se procesa **en tu navegador**.
- No hay servidor propio, cuentas, analíticas ni telemetría.
- La extensión no envía tus datos a ningún sitio por su cuenta. Solo hace peticiones de red si configuras tú un servidor opcional (ver más abajo).
- Los datos que detecta no se guardan en disco. Lo que se guarda son recuentos y tipos, nunca los valores.

## Qué procesa

Cuando escribes en ChatGPT, Claude, Gemini, Copilot, Gmail u Outlook Web, la extensión lee el texto del cuadro de mensaje y lo analiza con expresiones regulares y comprobaciones de checksum (Luhn, mod-97, letra del DNI). Si detecta datos sensibles, cambia esos valores por etiquetas en la petición que la página envía, y los repone en tu pantalla cuando llega la respuesta.

## Qué guarda y dónde

**En memoria (se pierde al cerrar el navegador o al detenerse la extensión):**

- La correspondencia entre cada etiqueta y el valor real (por ejemplo, `[DNI_1]` y tu DNI). Se conserva como máximo 15 minutos en el proceso de la extensión y no se escribe en disco.
- La sustitución preparada para el mensaje que estás escribiendo, hasta 2 minutos, en la memoria de la página.

**En tu navegador, en el almacenamiento local de la extensión:**

- Un historial de detecciones, con un máximo de 500 entradas: fecha, número de datos, tipo (por ejemplo, "DNI" o "IBAN"), categoría, nivel de riesgo y sitio donde ocurrió. **No incluye los valores detectados.**
- El último análisis, con los tipos y las etiquetas (sin los valores) para mostrarlo en el menú.

Se eliminan al desinstalar la extensión.

**En el almacenamiento sincronizado del navegador:**

- Tus ajustes: modo de protección, si la extensión está activada, la lista de sitios de confianza y, solo si los configuras, la URL y la clave de un servidor propio. Tu navegador puede sincronizarlos con tu cuenta de Chrome o de Edge según tu configuración de sincronización.

## Servidor opcional

La extensión puede conectarse a un servidor que tú configures en el menú (URL y clave). Es opcional y por defecto no hay ninguno. Si lo configuras:

- Cuando el análisis local no encuentra nada en un mensaje, ese texto se envía a tu servidor para una detección más profunda.
- La extensión no incluye ningún servidor. Quien lo administre es responsable de lo que reciba.
- El navegador te pide un permiso adicional, solo para esa dirección, la primera vez que guardas o pruebas la URL.

## Lo que AEGIS no hace

- No envía tus datos, tu historial ni tus ajustes a ningún tercero.
- No incluye analíticas, publicidad ni rastreo.
- No descarga ni ejecuta código remoto.
- No lee páginas que no estén en la lista de sitios compatibles.

## Un límite que conviene conocer

AEGIS cambia lo que la web **envía**. La propia web ve en su cuadro de texto lo que escribes antes de que AEGIS lo cambie, y los dos scripts de la extensión se comunican mediante eventos de la página, que el código de esa web podría leer. AEGIS sirve para evitar compartir datos por descuido en el envío normal del chat; no protege frente a una web que quiera leer activamente lo que escribes.

## Permisos

- `storage`: guardar los ajustes y el historial descritos arriba.
- `activeTab`: leer el sitio de la pestaña activa cuando abres el menú, para mostrar el estado y la lista de confianza.
- Acceso a los sitios compatibles: para interceptar lo que escribes en ellos y reponer los datos en la respuesta.
- Acceso opcional a un servidor propio: solo si lo configuras.

## Cambios en esta política

Esta política está versionada junto al código. Los cambios aparecen en el historial del archivo y se resumen en el [registro de cambios](CHANGELOG.md).

Este documento describe el comportamiento técnico de un proyecto personal. No es asesoramiento legal ni una certificación de cumplimiento del RGPD.
