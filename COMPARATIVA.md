# AEGIS frente a Microsoft Presidio

[Presidio](https://github.com/microsoft/presidio) es la referencia de código abierto para detectar y anonimizar datos personales en texto. Esta comparativa mide qué hace cada herramienta con los mismos textos, y dónde pierde cada una. Se hizo el 26 de octubre de 2026.

## Para qué sirve cada una

| | AEGIS | Presidio |
|---|---|---|
| Qué es | Extensión de navegador | Librería de Python |
| Dónde actúa | En el navegador, al enviar un mensaje a ChatGPT, Claude, Gemini u Outlook Web | En tus propios programas, datos o canalizaciones |
| Qué hace con lo detectado | Sustituye por etiquetas (`[DNI_1]`) y las restaura en la respuesta | Reemplaza, enmascara, cifra o borra (hay operador de cifrado reversible) |
| Detección de nombres | Solo por contexto, con expresiones regulares | Reconocimiento de entidades con modelos de spaCy |
| Claves y tokens | 13 tipos | Ninguno en la configuración por defecto (se añaden con reconocedores propios) |
| Peso | Unos 80 KB de JavaScript, sin dependencias | Python más modelos de lenguaje de decenas de MB |
| Instalación | Cargar una carpeta en el navegador | `pip install` y descargar un modelo |

No compiten del todo: Presidio no intercepta lo que escribes en una web, y AEGIS no sirve para limpiar un conjunto de datos.

## Método

- Los mismos 98 casos de prueba del repositorio ([test-runner.html](test-runner.html)), pasados por Presidio 2.2.365 con su configuración por defecto, los modelos `es_core_news_md` y `en_core_web_sm`, y los reconocedores predefinidos para español e inglés. Se ejecutó cada texto en ambos idiomas y se tomó la unión (el caso más favorable para Presidio).
- Se comparan los siete tipos que ambos cubren: email, IBAN, tarjeta, teléfono, DNI/NIE, IP y nombre.
- Los 98 casos los escribió el autor de AEGIS, así que **AEGIS sale favorecido por construcción**: acierta todos porque se afinó contra ellos. Lo útil de esta tabla es ver dónde falla Presidio y por qué, no la puntuación.
- Para los nombres sueltos se escribieron 16 frases nuevas, no vistas por ninguna de las dos herramientas al afinarlas (11 nombres reales, 5 frases sin ningún nombre).

## Resultados con los casos de AEGIS

| Tipo | Casos que debe detectar | Presidio | Casos que debe ignorar | Presidio |
|---|---|---|---|---|
| Email | 4 | 4 | 2 | 2 |
| IBAN | 3 | 3 | 2 | 2 |
| Tarjeta | 3 | 3 | 2 | 2 |
| DNI/NIE | 2 | 2 | 1 | 1 |
| Teléfono | 3 | 2 | 3 | 2 |
| IP | 2 | 2 | 3 | 0 |
| Nombre (con contexto) | 11 | 11 | 12 | 10 |
| **Total** | **28** | **27** | **25** | **19** |

Los siete fallos de Presidio:

- **Cuatro son una decisión distinta, no un error.** AEGIS ignora a propósito las IP privadas y locales (`192.168.1.1`, `10.0.0.47`, `127.0.0.1`) porque no identifican a nadie. Presidio las marca. Según lo que quieras, una u otra postura es la correcta.
- **Un teléfono fijo no detectado:** `Oficina central: 912 345 678.` lo leyó como organización.
- **Una IP pública también marcada como teléfono**, además de como IP.
- **Dos falsos positivos de nombre:** `Quedamos en la Plaza Mayor` marca `Quedamos` como persona, y `Tengo un problema con Gmail y con Outlook` marca `Tengo un` y `Gmail`.

Tipos donde la comparación no se puede hacer:

- **Claves y tokens (13 tipos, 29 casos):** Presidio no trae reconocedores para ellos por defecto.
- **Direcciones postales (16 casos):** Presidio no tiene un reconocedor de direcciones. Marca trozos como `LOCATION` (`Calle Mayor`, `Zaragoza`), pierde el número y el piso, y lee el código postal como fecha.

## Nombres sueltos, sin contexto

Aquí está la diferencia real.

| | Nombres encontrados (de 11) | Falsos positivos (en 16 frases) |
|---|---|---|
| AEGIS | 0 | 0 |
| Presidio | 9 | 9 |

AEGIS no detecta ningún nombre que no venga con contexto: `Dile a Javier que mañana no puedo`, `Según Pedro Sánchez` o `Mi hermana Nerea Aguirre vive en Donostia` pasan sin tocar. Presidio encuentra 9 de 11, pero también marca como persona palabras como `Paga`, `Quedamos`, `hablando`, `Necesito` o `Tengo un`, y dos veces nombres de productos (`Gmail`, `Java`). Con el modelo de español de tamaño medio la precisión en frases cortas es floja; un modelo mayor (`es_core_news_lg`) o uno basado en transformers la mejoraría a costa de peso y velocidad. No se probó.

Ninguna de las dos encontró `Maialen y Unai` (nombres vascos sin apellido).

## Velocidad

Presidio tardó unos 4 ms por frase corta en el equipo de pruebas, tras cargar los modelos (varios segundos al arrancar). AEGIS corre en el navegador sin carga previa y analiza mientras escribes.

## Conclusiones

- Para **datos con formato** (email, IBAN, tarjeta, DNI, teléfono) las dos herramientas rinden parecido. AEGIS añade validación por algoritmo, claves y tokens, y direcciones; Presidio añade más países, URL, fechas y otros identificadores.
- Para **nombres**, Presidio es claramente mejor en cobertura, a costa de falsos positivos. AEGIS prefiere no tocar un texto a equivocarse, y por eso se queda corta.
- La diferencia de fondo es dónde viven: AEGIS protege lo que un usuario envía a una IA desde el navegador; Presidio protege datos que pasan por código.
- Un uso razonable de las dos: el modo opcional con servidor de AEGIS podría apoyarse en Presidio para los nombres sueltos, y dejar las expresiones regulares para lo que tiene formato.
