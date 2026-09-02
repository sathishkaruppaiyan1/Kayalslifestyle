/**
 * WoodmartIcon — renders glyphs from the reference site's own icon font
 * (woodmart-font), for a pixel-exact match with kayalslifestyle.com.
 *
 * Phosphor (@phosphor-icons/react) is the primary icon system for this app.
 * Use this component only where an exact match to the reference site matters.
 *
 * Codepoints were read directly off the live site's rendered glyphs.
 */

export const WD_GLYPHS = {
  // header / tools
  user: "",
  userCircle: "",
  search: "",
  heart: "",
  cart: "",
  cartAdd: "",
  cartRemove: "",
  bag: "",
  menu: "",
  close: "",

  // product
  star: "",
  starOutline: "",
  expand: "",
  compare: "",
  ruler: "",

  // catalog controls
  filter: "",
  sliders: "",
  sort: "",
  grid: "",
  list: "",

  // navigation
  chevronRight: "",
  chevronLeft: "",
  chevronUp: "",
  chevronDown: "",
  arrowRight: "",
  arrowLeft: "",
  ellipsis: "",
  ellipsisVertical: "",

  // account / misc
  eye: "",
  eyeOff: "",
  signOut: "",
  gear: "",
  edit: "",
  download: "",
  check: "",
  plus: "",
  alert: "",
  play: "",
  home: "",
  store: "",
  mapPin: "",
  envelope: "",
  chat: "",
  quote: "",
  share: "",
  externalLink: "",
  spin360: "",

  // social
  instagram: "",
  youtube: "",
  tiktok: "",
  pinterest: "",
  twitter: "",
  linkedin: "",
} as const;

export type WoodmartIconName = keyof typeof WD_GLYPHS;

interface WoodmartIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: WoodmartIconName;
  size?: number | string;
}

const WoodmartIcon = ({ name, size = 20, className = "", style, ...rest }: WoodmartIconProps) => (
  <span
    aria-hidden="true"
    className={`wd-icon ${className}`}
    style={{ fontSize: typeof size === "number" ? `${size}px` : size, ...style }}
    {...rest}
  >
    {WD_GLYPHS[name]}
  </span>
);

export default WoodmartIcon;
