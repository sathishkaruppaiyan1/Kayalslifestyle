/* global KayalsHP, jQuery, wp */
/**
 * Homepage Builder admin.
 *
 * One state object (`state`) mirrors the saved option. Text inputs write into
 * state directly on input; anything structural (add / remove / reorder /
 * change section type) re-renders the whole list. Nothing here needs a build
 * step — it's plain DOM + the jQuery UI sortable WordPress already ships.
 */
(function ($) {
  'use strict';

  var state = KayalsHP.data || { topbar: { enabled: true, items: [] }, sections: [] };
  state.topbar = state.topbar || { enabled: true, items: [] };
  var productMeta = {}; // id -> {name, image, price, status} for manual rails
  var dirty = false;

  var TYPE_LABELS = {
    category_strip: 'Category Strip (top scroller)',
    hero: 'Hero Banners',
    reels: 'Shop by Reels',
    products: 'Product Rail',
    category_tabs: 'Browse by Category',
    reviews: 'Customer Reviews (images)',
  };

  var TYPE_HELP = {
    category_strip: 'Circular category bubbles above the hero. Leave the list empty to show every top-level category.',
    hero: 'Full-width slides. Each slide takes TWO images: a wide one for desktop/tablet and a taller (portrait) one for phones. Leave the phone image empty and the wide image is used on phones too.',
    reels: 'Portrait cards where the reel video autoplays. Pick the video, then search for the product — its image and caption sit at the bottom of the card and link to the product page.',
    products: 'A row of products. Pick them by hand and drag to order — leave the list empty and it shows the newest products automatically. Or point it at a category. Rename it to anything: Hot Sellers, Featured Picks, Wedding Edit…',
    category_tabs: 'Tabbed rail — one tab per category, showing that category\'s products. Leave the list empty to show every category.',
    reviews: 'Screenshots or photos of customer reviews. Add as many as you like.',
  };

  /* ---------------------------------------------------------------- */
  /* helpers                                                           */
  /* ---------------------------------------------------------------- */

  function uid() {
    return 's' + Math.random().toString(36).slice(2, 10);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function markDirty() {
    dirty = true;
    var btn = document.getElementById('hp-save');
    if (btn) btn.classList.add('is-dirty');
    var note = document.getElementById('hp-unsaved');
    if (note) note.hidden = false;
  }

  function textField(label, obj, key, opts) {
    opts = opts || {};
    var input = el('input', {
      type: opts.type || 'text',
      class: 'regular-text',
      value: obj[key] == null ? '' : obj[key],
      placeholder: opts.placeholder || '',
      oninput: function () {
        obj[key] = opts.type === 'number' ? parseInt(this.value, 10) || 0 : this.value;
        markDirty();
      },
    });
    if (opts.min) input.min = opts.min;
    if (opts.max) input.max = opts.max;
    return el('label', { class: 'hp-field' }, [el('span', { text: label }), input]);
  }

  function selectField(label, obj, key, options, onChange) {
    var select = el('select', {
      onchange: function () {
        obj[key] = isNaN(this.value) ? this.value : parseInt(this.value, 10);
        markDirty();
        if (onChange) onChange();
      },
    });
    options.forEach(function (o) {
      var opt = el('option', { value: o.value, text: o.label });
      if (String(o.value) === String(obj[key])) opt.selected = true;
      select.appendChild(opt);
    });
    return el('label', { class: 'hp-field' }, [el('span', { text: label }), select]);
  }

  function pickImage(opts, cb) {
    var frame = wp.media({
      title: opts.title || 'Choose image',
      button: { text: 'Use this image' },
      multiple: !!opts.multiple,
      library: { type: 'image' },
    });
    frame.on('select', function () {
      var selection = frame.state().get('selection').toJSON();
      cb(
        selection.map(function (a) {
          var sizes = a.sizes || {};
          return (sizes.large && sizes.large.url) || a.url;
        })
      );
    });
    frame.open();
  }

  function imageField(label, obj, key, opts) {
    var preview = el('img', { class: 'hp-thumb', src: obj[key] || '' });
    preview.hidden = !obj[key];
    var button = el('button', {
      type: 'button',
      class: 'button',
      text: obj[key] ? 'Change' : 'Choose image',
      onclick: function () {
        pickImage({ title: label }, function (urls) {
          obj[key] = urls[0];
          preview.src = urls[0];
          preview.hidden = false;
          button.textContent = 'Change';
          clear.hidden = false;
          markDirty();
        });
      },
    });
    var clear = el('button', {
      type: 'button',
      class: 'button-link hp-clear',
      text: 'Remove',
      onclick: function () {
        obj[key] = '';
        preview.hidden = true;
        button.textContent = 'Choose image';
        clear.hidden = true;
        markDirty();
      },
    });
    clear.hidden = !obj[key];
    return el('div', { class: 'hp-field hp-image-field' + (opts && opts.portrait ? ' is-portrait' : '') }, [
      el('span', { text: label }),
      el('div', { class: 'hp-image-controls' }, [preview, button, clear]),
    ]);
  }

  function pickVideo(opts, cb) {
    var frame = wp.media({
      title: opts.title || 'Choose video',
      button: { text: 'Use this video' },
      multiple: false,
      library: { type: 'video' },
    });
    frame.on('select', function () {
      var a = frame.state().get('selection').first().toJSON();
      cb(a.url);
    });
    frame.open();
  }

  /** Video from the media library (or a pasted .mp4 URL) with a small preview. */
  function videoField(label, obj, key) {
    var preview = el('video', { class: 'hp-video-preview', src: obj[key] || '', muted: 'muted', playsinline: 'playsinline', preload: 'metadata' });
    preview.hidden = !obj[key];
    var url = el('input', {
      type: 'url',
      class: 'regular-text',
      value: obj[key] || '',
      placeholder: 'or paste an .mp4 URL',
      oninput: function () {
        obj[key] = this.value.trim();
        preview.src = obj[key];
        preview.hidden = !obj[key];
        button.textContent = obj[key] ? 'Change' : 'Choose video';
        clear.hidden = !obj[key];
        markDirty();
      },
    });
    var button = el('button', {
      type: 'button',
      class: 'button',
      text: obj[key] ? 'Change' : 'Choose video',
      onclick: function () {
        pickVideo({ title: label }, function (src) {
          obj[key] = src;
          url.value = src;
          preview.src = src;
          preview.hidden = false;
          button.textContent = 'Change';
          clear.hidden = false;
          markDirty();
        });
      },
    });
    var clear = el('button', {
      type: 'button',
      class: 'button-link hp-clear',
      text: 'Remove',
      onclick: function () {
        obj[key] = '';
        url.value = '';
        preview.hidden = true;
        button.textContent = 'Choose video';
        clear.hidden = true;
        markDirty();
      },
    });
    clear.hidden = !obj[key];
    return el('div', { class: 'hp-field hp-video-field' }, [
      el('span', { text: label }),
      el('div', { class: 'hp-image-controls' }, [preview, button, clear]),
      url,
    ]);
  }

  /**
   * Product search for a reel. Picking a product points SHOP NOW at
   * /product/<id>, fills in the product image, and uses the product name as
   * the caption when none was typed.
   */
  function productField(item) {
    var wrap = el('div', { class: 'hp-field hp-product-field' }, [el('span', { text: 'Product (search to pick)' })]);

    var m = /^\/product\/(\d+)$/.exec(item.shop || '');
    if (m) {
      var meta = productMeta[parseInt(m[1], 10)];
      wrap.appendChild(
        el('div', { class: 'hp-result is-chosen' }, [
          item.thumb ? el('img', { src: item.thumb }) : el('span', { class: 'hp-product-thumb is-empty' }),
          el('span', { text: meta ? meta.name : 'Product #' + m[1] }),
          meta ? el('span', { class: 'hp-price', text: meta.price }) : null,
        ])
      );
    }

    var results = el('div', { class: 'hp-results' });
    results.hidden = true;
    var timer = null;
    var search = el('input', {
      type: 'search',
      class: 'regular-text',
      placeholder: m ? 'Search to change product…' : 'Search products…',
      oninput: function () {
        var q = this.value.trim();
        clearTimeout(timer);
        if (q.length < 2) {
          results.hidden = true;
          return;
        }
        timer = setTimeout(function () {
          $.getJSON(KayalsHP.ajaxUrl, { action: 'kayals_hp_search_products', nonce: KayalsHP.nonce, q: q }, function (res) {
            results.innerHTML = '';
            var items = (res && res.data) || [];
            if (items.length === 0) {
              results.appendChild(el('p', { class: 'description', text: 'No products match.' }));
            }
            items.forEach(function (p) {
              productMeta[p.id] = p;
              results.appendChild(
                el('button', {
                  type: 'button',
                  class: 'hp-result',
                  onclick: function () {
                    item.shop = '/product/' + p.id;
                    item.thumb = p.image_large || p.image || item.thumb;
                    if (!item.title) item.title = p.name;
                    markDirty();
                    render();
                  },
                }, [
                  p.image ? el('img', { src: p.image }) : el('span', { class: 'hp-product-thumb is-empty' }),
                  el('span', { text: p.name }),
                  el('span', { class: 'hp-price', text: p.price }),
                ])
              );
            });
            results.hidden = false;
          });
        }, 250);
      },
    });
    wrap.appendChild(el('div', { class: 'hp-search' }, [search, results]));
    return wrap;
  }

  /** Sortable list of item rows; `renderRow(item, index)` returns the row's body. */
  function itemList(sec, renderRow, opts) {
    var list = el('div', { class: 'hp-items' });
    sec.items = sec.items || [];
    sec.items.forEach(function (item, index) {
      var row = el('div', { class: 'hp-item', 'data-index': index }, [
        el('span', { class: 'hp-drag dashicons dashicons-move', title: 'Drag to reorder' }),
        el('div', { class: 'hp-item-body' }, [renderRow(item, index)]),
        el('button', {
          type: 'button',
          class: 'button-link hp-remove dashicons dashicons-no-alt',
          title: 'Remove',
          onclick: function () {
            sec.items.splice(index, 1);
            markDirty();
            render();
          },
        }),
      ]);
      list.appendChild(row);
    });
    if (sec.items.length === 0 && opts && opts.emptyText) {
      list.appendChild(el('p', { class: 'description hp-empty', text: opts.emptyText }));
    }
    $(list).sortable({
      handle: '.hp-drag',
      items: '.hp-item',
      axis: 'y',
      update: function () {
        var order = $(list)
          .children('.hp-item')
          .map(function () {
            return parseInt(this.getAttribute('data-index'), 10);
          })
          .get();
        sec.items = order.map(function (i) {
          return sec.items[i];
        });
        markDirty();
        render();
      },
    });
    return list;
  }

  function termOptions(terms, placeholder) {
    var opts = [{ value: 0, label: placeholder }];
    terms.forEach(function (t) {
      opts.push({ value: t.id, label: t.name + ' (' + t.count + ')' });
    });
    return opts;
  }

  function categoryById(id) {
    return KayalsHP.categories.filter(function (c) {
      return c.id === id;
    })[0];
  }

  /* ---------------------------------------------------------------- */
  /* section bodies                                                    */
  /* ---------------------------------------------------------------- */

  function bodyCategories(sec) {
    var list = itemList(
      sec,
      function (id) {
        var cat = categoryById(id);
        return el('span', { class: 'hp-item-title', text: cat ? cat.name : 'Category #' + id + ' (deleted)' });
      },
      { emptyText: 'No categories chosen — every top-level category will be shown in WooCommerce order.' }
    );
    var add = el('select', { class: 'hp-add-select' });
    add.appendChild(el('option', { value: '', text: '+ Add category…' }));
    KayalsHP.categories.forEach(function (c) {
      if (sec.items.indexOf(c.id) !== -1) return;
      add.appendChild(el('option', { value: c.id, text: (c.parent ? '— ' : '') + c.name + ' (' + c.count + ')' }));
    });
    add.addEventListener('change', function () {
      if (!this.value) return;
      sec.items.push(parseInt(this.value, 10));
      markDirty();
      render();
    });
    return el('div', {}, [list, add]);
  }

  function bodyHero(sec) {
    var list = itemList(
      sec,
      function (item) {
        return el('div', { class: 'hp-grid' }, [
          imageField('Desktop / tablet image (wide, e.g. 1920×700)', item, 'image'),
          imageField('Phone image (portrait, e.g. 800×1000)', item, 'mobile_image', { portrait: true }),
          textField('Link (e.g. /collections/sarees)', item, 'link', { placeholder: '/collections/all' }),
          textField('Alt text', item, 'alt'),
        ]);
      },
      { emptyText: 'No banners yet. Without any, the storefront shows its built-in hero image.' }
    );
    var add = el('button', {
      type: 'button',
      class: 'button',
      text: '+ Add banner',
      onclick: function () {
        pickImage({ title: 'Choose banner image' }, function (urls) {
          sec.items.push({ image: urls[0], mobile_image: '', link: '/collections/all', alt: '' });
          markDirty();
          render();
        });
      },
    });
    return el('div', {}, [list, add]);
  }

  function bodyReels(sec) {
    var list = itemList(
      sec,
      function (item) {
        return el('div', { class: 'hp-grid' }, [
          videoField('Reel video (autoplays)', item, 'video'),
          productField(item),
          textField('Caption', item, 'title'),
          textField('SHOP NOW goes to', item, 'shop', { placeholder: '/product/123 or /collections/slug' }),
          imageField('Product image', item, 'thumb', { portrait: true }),
          textField('Instagram reel URL (optional)', item, 'href', { placeholder: 'https://www.instagram.com/reel/…' }),
        ]);
      },
      { emptyText: 'No reels yet — the section is hidden on the storefront until you add one.' }
    );
    var add = el('button', {
      type: 'button',
      class: 'button',
      text: '+ Add reel',
      onclick: function () {
        pickVideo({ title: 'Choose reel video' }, function (src) {
          sec.items.push({ title: '', thumb: '', href: '', shop: '', video: src });
          markDirty();
          render();
        });
      },
    });
    return el('div', {}, [list, add]);
  }

  function bodyReviews(sec) {
    var list = itemList(
      sec,
      function (item) {
        return el('div', { class: 'hp-grid' }, [
          imageField('Review image', item, 'image', { portrait: true }),
          textField('Caption (optional)', item, 'caption'),
        ]);
      },
      { emptyText: 'No review images yet — the section is hidden until you add one.' }
    );
    var add = el('button', {
      type: 'button',
      class: 'button',
      text: '+ Add review images',
      onclick: function () {
        pickImage({ title: 'Choose review images', multiple: true }, function (urls) {
          urls.forEach(function (u) {
            sec.items.push({ image: u, caption: '' });
          });
          markDirty();
          render();
        });
      },
    });
    return el('div', {}, [list, add]);
  }

  function bodyProducts(sec) {
    sec.products = sec.products || [];
    var wrap = el('div', {});

    var settings = el('div', { class: 'hp-grid' }, [
      textField('Emoji (optional)', sec, 'emoji', { placeholder: '⚡' }),
      selectField('Layout', sec, 'layout', [
        { value: 'grid', label: 'Grid (like Hot Sellers)' },
        { value: 'carousel', label: 'Carousel (like Featured Picks)' },
      ]),
      selectField(
        'Products come from',
        sec,
        'source',
        [
          { value: 'manual', label: 'Hand-picked (empty = newest products)' },
          { value: 'category', label: 'A category' },
        ],
        render
      ),
      textField('How many to show (automatic lists only)', sec, 'limit', { type: 'number', min: 1, max: 48 }),
      textField('"View all" link (optional)', sec, 'view_all', { placeholder: '/collections/slug' }),
    ]);
    wrap.appendChild(settings);

    if (sec.source === 'category') {
      wrap.appendChild(selectField('Category', sec, 'category', termOptions(KayalsHP.categories, '— choose —')));
      wrap.appendChild(el('p', { class: 'description', text: 'Order follows the category\'s product order in WooCommerce (Products → Sorting).' }));
    } else {
      wrap.appendChild(manualPicker(sec));
    }
    return wrap;
  }

  function manualPicker(sec) {
    var wrap = el('div', { class: 'hp-picker' });

    // chosen list
    var list = el('div', { class: 'hp-items' });
    sec.products.forEach(function (id, index) {
      var meta = productMeta[id];
      var row = el('div', { class: 'hp-item hp-product', 'data-id': id }, [
        el('span', { class: 'hp-drag dashicons dashicons-move' }),
        meta && meta.image ? el('img', { class: 'hp-product-thumb', src: meta.image }) : el('span', { class: 'hp-product-thumb is-empty' }),
        el('span', { class: 'hp-item-title' }, [
          meta ? meta.name : 'Product #' + id,
          meta && meta.status !== 'publish' ? el('em', { class: 'hp-warn', text: ' (' + meta.status + ' — hidden on storefront)' }) : null,
        ]),
        meta ? el('span', { class: 'hp-price', text: meta.price }) : null,
        el('button', {
          type: 'button',
          class: 'button-link hp-remove dashicons dashicons-no-alt',
          onclick: function () {
            sec.products.splice(index, 1);
            markDirty();
            render();
          },
        }),
      ]);
      list.appendChild(row);
    });
    if (sec.products.length === 0) {
      list.appendChild(el('p', { class: 'description hp-empty', text: 'Nothing picked — showing the newest products automatically. Search below to curate this rail.' }));
    }
    $(list).sortable({
      handle: '.hp-drag',
      items: '.hp-item',
      axis: 'y',
      update: function () {
        sec.products = $(list)
          .children('.hp-item')
          .map(function () {
            return parseInt(this.getAttribute('data-id'), 10);
          })
          .get();
        markDirty();
      },
    });
    wrap.appendChild(list);

    // search
    var results = el('div', { class: 'hp-results' });
    results.hidden = true;
    var timer = null;
    var search = el('input', {
      type: 'search',
      class: 'regular-text',
      placeholder: 'Search products to add…',
      oninput: function () {
        var q = this.value.trim();
        clearTimeout(timer);
        if (q.length < 2) {
          results.hidden = true;
          return;
        }
        timer = setTimeout(function () {
          $.getJSON(KayalsHP.ajaxUrl, { action: 'kayals_hp_search_products', nonce: KayalsHP.nonce, q: q }, function (res) {
            results.innerHTML = '';
            var items = (res && res.data) || [];
            if (items.length === 0) {
              results.appendChild(el('p', { class: 'description', text: 'No products match.' }));
            }
            items.forEach(function (p) {
              productMeta[p.id] = p;
              var already = sec.products.indexOf(p.id) !== -1;
              results.appendChild(
                el('button', {
                  type: 'button',
                  class: 'hp-result' + (already ? ' is-added' : ''),
                  disabled: already ? 'disabled' : null,
                  onclick: function () {
                    sec.products.push(p.id);
                    markDirty();
                    render();
                  },
                }, [
                  p.image ? el('img', { src: p.image }) : el('span', { class: 'hp-product-thumb is-empty' }),
                  el('span', { text: p.name }),
                  el('span', { class: 'hp-price', text: already ? 'Added' : p.price }),
                ])
              );
            });
            results.hidden = false;
          });
        }, 250);
      },
    });
    wrap.appendChild(el('div', { class: 'hp-search' }, [search, results]));
    return wrap;
  }

  /* ---------------------------------------------------------------- */
  /* section shell + render                                            */
  /* ---------------------------------------------------------------- */

  var BODIES = {
    category_strip: bodyCategories,
    category_tabs: bodyCategories,
    hero: bodyHero,
    reels: bodyReels,
    reviews: bodyReviews,
    products: bodyProducts,
  };

  var collapsed = {};

  function renderSection(sec, index) {
    var isOpen = !collapsed[sec.id];

    var enabled = el('input', {
      type: 'checkbox',
      onchange: function () {
        sec.enabled = this.checked;
        card.classList.toggle('is-disabled', !sec.enabled);
        markDirty();
      },
    });
    enabled.checked = !!sec.enabled;

    var title = el('input', {
      type: 'text',
      class: 'hp-title',
      value: sec.title || '',
      placeholder: sec.type === 'hero' || sec.type === 'category_strip' ? '(no heading)' : 'Section heading',
      oninput: function () {
        sec.title = this.value;
        markDirty();
      },
    });

    var card = el('div', { class: 'hp-section' + (sec.enabled ? '' : ' is-disabled') + (isOpen ? ' is-open' : ''), 'data-id': sec.id }, [
      el('div', { class: 'hp-section-head' }, [
        el('span', { class: 'hp-drag dashicons dashicons-move', title: 'Drag to reorder' }),
        el('span', { class: 'hp-type', text: TYPE_LABELS[sec.type] }),
        title,
        el('label', { class: 'hp-toggle' }, [enabled, ' Show']),
        el('button', {
          type: 'button',
          class: 'button-link dashicons ' + (isOpen ? 'dashicons-arrow-up-alt2' : 'dashicons-arrow-down-alt2'),
          title: isOpen ? 'Collapse' : 'Expand',
          onclick: function () {
            collapsed[sec.id] = isOpen;
            render();
          },
        }),
        el('button', {
          type: 'button',
          class: 'button-link hp-delete dashicons dashicons-trash',
          title: 'Delete section',
          onclick: function () {
            if (!window.confirm('Delete "' + (sec.title || TYPE_LABELS[sec.type]) + '"?')) return;
            state.sections.splice(index, 1);
            markDirty();
            render();
          },
        }),
      ]),
      isOpen
        ? el('div', { class: 'hp-section-body' }, [
            el('p', { class: 'description', text: TYPE_HELP[sec.type] }),
            BODIES[sec.type](sec),
          ])
        : null,
    ]);
    return card;
  }

  /** The announcement strip above the header — global, so it sits apart from the section list. */
  function renderTopbar() {
    var tb = state.topbar;
    tb.items = tb.items || [];

    var enabled = el('input', {
      type: 'checkbox',
      onchange: function () {
        tb.enabled = this.checked;
        card.classList.toggle('is-disabled', !tb.enabled);
        markDirty();
      },
    });
    enabled.checked = !!tb.enabled;

    var list = itemList(
      tb,
      function (item) {
        var row = el('div', { class: 'hp-grid hp-topbar-row' });
        row.appendChild(
          selectField('Kind', item, 'type', [
            { value: 'text', label: 'Message' },
            { value: 'whatsapp', label: 'WhatsApp number' },
          ], render)
        );
        row.appendChild(textField(item.type === 'whatsapp' ? 'Label before the number' : 'Message', item, 'text', { placeholder: 'Free Shipping in India' }));
        if (item.type === 'whatsapp') {
          row.appendChild(textField('Phone (with country code)', item, 'phone', { placeholder: '+91 8220027625' }));
        } else {
          row.appendChild(textField('Link (optional)', item, 'link', { placeholder: '/collections/all' }));
        }
        return row;
      },
      { emptyText: 'No messages — the bar is hidden on the storefront.' }
    );

    var add = el('button', {
      type: 'button',
      class: 'button',
      text: '+ Add message',
      onclick: function () {
        tb.items.push({ type: 'text', text: '', phone: '', link: '' });
        markDirty();
        render();
      },
    });

    var card = el('div', { class: 'hp-section hp-topbar is-open' + (tb.enabled ? '' : ' is-disabled') }, [
      el('div', { class: 'hp-section-head' }, [
        el('span', { class: 'hp-type', text: 'Top Bar' }),
        el('strong', { class: 'hp-title-static', text: 'Announcement bar (scrolling strip above the header)' }),
        el('label', { class: 'hp-toggle' }, [enabled, ' Show']),
      ]),
      el('div', { class: 'hp-section-body' }, [
        el('p', { class: 'description', text: 'Shown on every page. Messages scroll left to right, separated by a divider.' }),
        list,
        add,
      ]),
    ]);
    return card;
  }


  /* ---------------------------------------------------------------- */
  /* Photo-search index                                                 */
  /*                                                                    */
  /* Fingerprints every product image with MobileNet (TensorFlow.js,    */
  /* loaded on this page) and saves the result through the plugin. The  */
  /* storefront downloads that file and compares a shopper's photo      */
  /* against all of it locally — no server, no per-search cost.         */
  /* ---------------------------------------------------------------- */

  var indexStatus = KayalsHP.index || { built: false, count: 0, catalog: 0 };
  var indexing = false;

  function quantize(vec) {
    // unit vector → int8 (×127); good enough for ranking, 4× smaller than float32
    var out = new Int8Array(vec.length);
    for (var i = 0; i < vec.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(vec[i] * 127)));
    return out;
  }

  function normalize(vec) {
    var sum = 0;
    for (var i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
    var norm = Math.sqrt(sum) || 1;
    var out = new Float32Array(vec.length);
    for (var j = 0; j < vec.length; j++) out[j] = vec[j] / norm;
    return out;
  }

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadImg(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var timer = setTimeout(function () { img.src = ''; reject(new Error('image timed out: ' + url)); }, 30000);
      img.crossOrigin = 'anonymous';
      img.onload = function () { clearTimeout(timer); resolve(img); };
      img.onerror = function () { clearTimeout(timer); reject(new Error('image failed: ' + url)); };
      img.src = url;
    });
  }

  async function buildIndex(rebuildAll, ui) {
    if (indexing) return;
    if (typeof window.mobilenet === 'undefined' || typeof window.tf === 'undefined') {
      ui.status('TensorFlow.js did not load — check that this admin page can reach cdn.jsdelivr.net.');
      return;
    }
    indexing = true;
    ui.busy(true);
    try {
      ui.status('Loading catalogue…');
      var catalog = await fetch(KayalsHP.restBase + '/catalog', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
      var products = catalog.products || [];

      // Keep fingerprints we already have unless asked to redo everything.
      var existing = {};
      if (!rebuildAll && indexStatus.built && indexStatus.url) {
        try {
          var prev = await fetch(indexStatus.url, { cache: 'no-store' }).then(function (r) { return r.json(); });
          if (prev && prev.model === indexStatus.model && Array.isArray(prev.ids)) {
            var bytes = base64ToBytes(prev.data);
            prev.ids.forEach(function (id, i) {
              existing[id] = bytes.subarray(i * prev.dim, (i + 1) * prev.dim);
            });
          }
        } catch (e) { /* start fresh */ }
      }

      var todo = products.filter(function (p) { return !existing[p.id]; });
      ui.status('Loading model… (' + todo.length + ' of ' + products.length + ' products to fingerprint)');
      var model = await window.mobilenet.load({ version: 2, alpha: 0.5 });

      var fresh = {};
      var failedItems = [];
      async function fingerprint(list, label) {
        var done = 0, cursor = 0;
        async function worker() {
          while (cursor < list.length) {
            var p = list[cursor++];
            try {
              var img = await loadImg(p.image);
              var t = model.infer(img, true);
              var data = await t.data();
              t.dispose();
              fresh[p.id] = quantize(normalize(data));
            } catch (e) {
              failedItems.push(p);
            }
            done++;
            if (done % 5 === 0 || done === list.length) {
              ui.progress(done, list.length);
              ui.status(label + ' ' + done + ' / ' + list.length + (document.visibilityState === 'hidden' ? ' — keep this tab visible, browsers pause the work in background tabs' : ''));
            }
          }
        }
        await Promise.all([worker(), worker(), worker()]);
      }
      await fingerprint(todo, 'Fingerprinting products…');
      // Anything that failed (slow image, tab briefly in the background) gets one more go.
      if (failedItems.length) {
        var retry = failedItems.splice(0);
        await fingerprint(retry, 'Retrying ' + retry.length + ' skipped image(s)…');
      }
      var failed = failedItems.length;

      // Assemble in catalogue order; products that failed both times are left out.
      var ids = [];
      var chunks = [];
      products.forEach(function (p) {
        var v = fresh[p.id] || existing[p.id];
        if (v) { ids.push(p.id); chunks.push(v); }
      });
      var dim = indexStatus.dim || 1280;
      var all = new Uint8Array(ids.length * dim);
      chunks.forEach(function (v, i) { all.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), i * dim); });

      ui.status('Saving index (' + ids.length + ' products)…');
      var res = await $.post(KayalsHP.ajaxUrl, {
        action: 'kayals_hp_save_index',
        nonce: KayalsHP.nonce,
        index: JSON.stringify({ ids: ids, data: bytesToBase64(all) }),
      });
      if (!res || !res.success) throw new Error((res && res.data) || 'save failed');
      indexStatus = res.data;
      ui.status('Done — ' + ids.length + ' products indexed' + (failed ? ' (' + failed + ' skipped: image could not be read)' : '') + '. Photo search on the storefront now covers them.');
      ui.progress(1, 1);
      ui.refresh();
    } catch (err) {
      ui.status('Failed: ' + (err && err.message ? err.message : err));
    } finally {
      indexing = false;
      ui.busy(false);
    }
  }

  function renderIndexPanel() {
    var st = indexStatus;
    var missing = Math.max(0, (st.catalog || 0) - (st.count || 0));
    var summary = st.built
      ? st.count + ' of ' + st.catalog + ' products indexed' + (st.built_at ? ' · last built ' + new Date(st.built_at).toLocaleString() : '') + (missing > 0 ? ' · ' + missing + ' new product(s) not yet indexed' : '')
      : 'Not built yet — photo search on the storefront falls back to colour matching until you build it.';

    var statusLine = el('p', { class: 'hp-index-status', text: summary });
    var bar = el('div', { class: 'hp-progress' }, [el('div', { class: 'hp-progress-bar' })]);
    bar.hidden = true;

    var ui = {
      status: function (t) { statusLine.textContent = t; },
      progress: function (d, total) { bar.hidden = false; bar.firstChild.style.width = Math.round((d / Math.max(1, total)) * 100) + '%'; },
      busy: function (b) { updateBtn.disabled = b; rebuildBtn.disabled = b; },
      refresh: function () { setTimeout(render, 1500); },
    };

    var updateBtn = el('button', {
      type: 'button', class: 'button button-primary',
      text: st.built ? 'Update index (new products only)' : 'Build index',
      onclick: function () { buildIndex(false, ui); },
    });
    var rebuildBtn = el('button', {
      type: 'button', class: 'button',
      text: 'Rebuild everything',
      onclick: function () {
        if (window.confirm('Re-fingerprint all ' + st.catalog + ' products? This takes a few minutes.')) buildIndex(true, ui);
      },
    });
    if (!st.built) rebuildBtn.hidden = true;

    return el('div', { class: 'hp-section hp-topbar is-open' }, [
      el('div', { class: 'hp-section-head' }, [
        el('span', { class: 'hp-type', text: 'Photo search' }),
        el('strong', { class: 'hp-title-static', text: 'Image index for "search by photo"' }),
      ]),
      el('div', { class: 'hp-section-body' }, [
        el('p', { class: 'description', text: 'Shoppers can upload a photo and get look-alike products. That needs a fingerprint of every product image, computed here in your browser (about 1–3 minutes for the whole catalogue, a few seconds for new products). Keep this tab in front while it runs. Run "Update" after adding products.' }),
        statusLine,
        bar,
        el('div', { class: 'hp-index-actions' }, [updateBtn, rebuildBtn]),
      ]),
    ]);
  }

  function render() {
    var root = document.getElementById('kayals-hp-app');
    root.innerHTML = '';

    root.appendChild(el('h2', { class: 'hp-heading', text: 'Top bar' }));
    root.appendChild(renderTopbar());
    root.appendChild(el('h2', { class: 'hp-heading', text: 'Photo search' }));
    root.appendChild(renderIndexPanel());
    root.appendChild(el('h2', { class: 'hp-heading', text: 'Homepage sections' }));

    var list = el('div', { id: 'hp-sections' });
    state.sections.forEach(function (sec, i) {
      list.appendChild(renderSection(sec, i));
    });
    root.appendChild(list);

    $(list).sortable({
      handle: '.hp-section-head .hp-drag',
      items: '.hp-section',
      axis: 'y',
      placeholder: 'hp-section-placeholder',
      update: function () {
        var order = $(list)
          .children('.hp-section')
          .map(function () {
            return this.getAttribute('data-id');
          })
          .get();
        state.sections.sort(function (a, b) {
          return order.indexOf(a.id) - order.indexOf(b.id);
        });
        markDirty();
      },
    });

    // add section
    var addSelect = el('select', {});
    addSelect.appendChild(el('option', { value: '', text: '+ Add a section…' }));
    Object.keys(TYPE_LABELS).forEach(function (t) {
      addSelect.appendChild(el('option', { value: t, text: TYPE_LABELS[t] }));
    });
    addSelect.addEventListener('change', function () {
      var type = this.value;
      if (!type) return;
      var sec = { id: uid(), type: type, enabled: true, title: '', items: [] };
      if (type === 'products') {
        Object.assign(sec, { emoji: '', layout: 'grid', source: 'manual', category: 0, limit: 8, products: [], view_all: '' });
        sec.title = 'New Section';
      } else if (type === 'reels') sec.title = 'Shop by Reels';
      else if (type === 'category_tabs') sec.title = 'Browse by Category';
      else if (type === 'reviews') sec.title = 'What Our Customers Say';
      state.sections.push(sec);
      markDirty();
      render();
      window.scrollTo(0, document.body.scrollHeight);
    });

    var save = el('button', {
      id: 'hp-save',
      type: 'button',
      class: 'button button-primary button-hero' + (dirty ? ' is-dirty' : ''),
      text: 'Save homepage',
      onclick: saveState,
    });
    var unsaved = el('span', { id: 'hp-unsaved', class: 'hp-unsaved', text: 'Unsaved changes' });
    unsaved.hidden = !dirty;
    var status = el('span', { id: 'hp-status', class: 'hp-status' });

    root.appendChild(el('div', { class: 'hp-footer' }, [addSelect, save, unsaved, status]));
    root.appendChild(
      el('p', { class: 'description hp-endpoint' }, [
        'Storefront reads: ',
        el('a', { href: KayalsHP.restUrl, target: '_blank', text: KayalsHP.restUrl }),
      ])
    );
  }

  function saveState() {
    var status = document.getElementById('hp-status');
    status.textContent = 'Saving…';
    $.post(
      KayalsHP.ajaxUrl,
      { action: 'kayals_hp_save', nonce: KayalsHP.nonce, config: JSON.stringify(state) },
      function (res) {
        if (res && res.success) {
          state = res.data;
          dirty = false;
          render();
          document.getElementById('hp-status').textContent = 'Saved ✓ — live on the storefront.';
        } else {
          status.textContent = 'Save failed: ' + ((res && res.data) || 'unknown error');
        }
      }
    ).fail(function () {
      status.textContent = 'Save failed — check your connection.';
    });
  }

  /* ---------------------------------------------------------------- */
  /* boot: hydrate product names for manual rails, then render         */
  /* ---------------------------------------------------------------- */

  function boot() {
    var ids = [];
    state.sections.forEach(function (s) {
      if (s.type === 'products' && s.products) ids = ids.concat(s.products);
      if (s.type === 'reels' && s.items) {
        s.items.forEach(function (i) {
          var m = /^\/product\/(\d+)$/.exec(i.shop || '');
          if (m) ids.push(parseInt(m[1], 10));
        });
      }
    });
    if (ids.length === 0) {
      render();
      return;
    }
    $.getJSON(KayalsHP.ajaxUrl, { action: 'kayals_hp_products_by_ids', nonce: KayalsHP.nonce, ids: ids.join(',') })
      .done(function (res) {
        ((res && res.data) || []).forEach(function (p) {
          productMeta[p.id] = p;
        });
      })
      .always(render);
  }

  window.addEventListener('beforeunload', function (e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  $(boot);
})(jQuery);
