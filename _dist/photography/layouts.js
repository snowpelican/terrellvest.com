// Curated pages for each collection, for each screen size.
//
// sizes: a name and a media query for each screen size. The page uses the first size that matches.
// When a collection has no pages for that size, it uses the next size in the list.
// When it has no pages for any size, the page groups the photos automatically.
//
// collections: the pages for each collection, by collection title, then by size name.
// A page is a list of photo ids, for example ['02', '03'].
// A page can also be an object with these settings:
//   photos  the photo ids on the page, in order.
//   dir     'row' puts the photos side by side. 'col' stacks them. Leave it out to use the layout that shows the photos largest.
//   scale   a number from 0 to 1 that makes the photos smaller than the page allows, for more white space. The default is 1.
//
// On large screens the first page shows beside the collection title.
// A photo of the collection that no page names goes on its own page at the end.
window.LAYOUTS = {
  sizes: {
    phone: '(max-width:760px) and (min-height:501px)',
    landscape: '(max-height:500px)',
    tablet: '(max-width:1100px)',
    desktop: 'all'
  },
  collections: {
    Work: {
      phone: [
        ['01'],
        ['02', '03'],
        ['04', '05'],
        ['10'],
        ['06', '07'],
        { photos: ['09'], scale: .8 },
        ['08']
      ],
      desktop: [
        ['01'],
        ['02'],
        ['03'],
        { photos: ['04', '05'], dir: 'row' },
        ['10'],
        ['06'],
        ['07'],
        { photos: ['09'], scale: .8 },
        ['08']
      ]
    }
  }
};
