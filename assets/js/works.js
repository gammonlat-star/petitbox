// ---- Catálogo de obras: título real + artista, nunca numeración
//      genérica. El color por defecto alterna entre los disponibles
//      para que la portada no se vea monocroma. ----
const works = [
  {key:'davinci-monalisa', title:'Mona Lisa', artist:'Leonardo da Vinci'},
  {key:'velazquez-meninas', title:'Las Meninas', artist:'Diego Velázquez'},
  {key:'botticelli-venus', title:'The Birth of Venus', artist:'Sandro Botticelli'},
  {key:'vangogh-nocheestrellada', title:'The Starry Night', artist:'Vincent van Gogh'},
  {key:'klimt-elbeso', title:'The Kiss', artist:'Gustav Klimt'},
  {key:'munch-grito', title:'The Scream', artist:'Edvard Munch'},
  {key:'monet-nenufares', title:'Water Lilies', artist:'Claude Monet'},
  {key:'vermeer-perla', title:'Girl with a Pearl Earring', artist:'Johannes Vermeer'},
  {key:'miguelangel-creaciondeadan', title:'The Creation of Adam', artist:'Michelangelo'},
  {key:'renoir-canotiers', title:'Luncheon of the Boating Party', artist:'Pierre-Auguste Renoir'},
  {key:'degas-bailarinas', title:'Dancers in Blue', artist:'Edgar Degas'},
  {key:'wood-americangothic', title:'American Gothic', artist:'Grant Wood'},
  {key:'toulouselautrec-moulinrouge', title:'Moulin Rouge, La Goulue', artist:'Toulouse-Lautrec'},
  {key:'kandinsky-composicionVII', title:'Composition VII', artist:'Wassily Kandinsky'},
  {key:'hilmaafklint-adolescente', title:'The Ten Largest, Adulthood', artist:'Hilma af Klint'},
];

// Solo blanco y negro por ahora — confirmado con el proveedor de poleras.
const colors = ['negro','blanco'];
const colorLabels = {
  negro: 'Black',
  blanco: 'White',
  verde: 'Green',
  marron: 'Brown',
  gris: 'Gray',
  camello: 'Camel',
};

const colorSequence = ['negro','blanco'];
works.forEach((w, i) => { w.defaultColor = colorSequence[i % colorSequence.length]; });
