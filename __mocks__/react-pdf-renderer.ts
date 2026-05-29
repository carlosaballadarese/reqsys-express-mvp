export const Document     = () => null
export const Page         = () => null
export const View         = () => null
export const Text         = () => null
export const Image        = () => null
export const StyleSheet   = { create: (s: any) => s }
export const Font         = { register: () => {} }
export const renderToBuffer = jest.fn().mockResolvedValue(Buffer.from('PDF'))
